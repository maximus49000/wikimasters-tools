import { positionFromTimezone, type Position } from '../core/library/sky';

// La position n'est jamais stockée ni envoyée : elle ne sert qu'au calcul du lever et du coucher, sur l'appareil.
let known: Position | null = null;
let cachedFallback: Position | null = null;
const listeners = new Set<() => void>();

// Repli mémorisé : useSyncExternalStore exige un snapshot stable entre deux lectures.
const fallback = (): Position => (cachedFallback ??= positionFromTimezone(-new Date().getTimezoneOffset()));

export function currentPosition(): Position {
  return known ?? fallback();
}

export function subscribePosition(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function resetPositionForTests(): void {
  known = null;
  cachedFallback = null;
}

// À appeler seulement après un choix explicite de « Heure réelle » : le navigateur demande alors l'accord du joueur.
export function requestPosition(): Promise<Position> {
  return new Promise((resolve) => {
    const geo = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
    if (!geo) return resolve(currentPosition());
    const timer = window.setTimeout(() => resolve(currentPosition()), 8000);
    geo.getCurrentPosition(
      (p) => {
        window.clearTimeout(timer);
        known = { lat: p.coords.latitude, lon: p.coords.longitude };
        for (const listener of listeners) listener();
        resolve(known);
      },
      () => {
        window.clearTimeout(timer);
        resolve(currentPosition());
      },
      { maximumAge: 3600000, timeout: 7000 },
    );
  });
}
