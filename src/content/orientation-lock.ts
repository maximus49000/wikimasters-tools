import type { Orientation } from '../core/library/library-types';

// Ce que l'on utilise de `screen` : absent sur ordinateur, sur iOS et dans certaines WebView, ou refusé hors plein écran.
export type ScreenLike = { orientation?: { lock?: (orientation: string) => Promise<void> | void; unlock?: () => void } };

// Verrouille l'écran dans l'orientation de la pièce. Jamais d'erreur : un appareil qui refuse garde son orientation.
export function lockOrientation(orientation: Orientation, screenLike: ScreenLike = screen as ScreenLike): void {
  try {
    const result = screenLike.orientation?.lock?.(orientation === 'portrait' ? 'portrait' : 'landscape');
    void Promise.resolve(result).catch(() => undefined);
  } catch {
    // API absente ou refusée : sans effet.
  }
}

export function unlockOrientation(screenLike: ScreenLike = screen as ScreenLike): void {
  try {
    screenLike.orientation?.unlock?.();
  } catch {
    // Pas de verrou à lever.
  }
}
