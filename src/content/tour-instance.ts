import type { TourStep } from '../core/whats-new/types';
import { createTourController } from './tour-control';
import { getTourEnv } from './tour-registry';
import type { TourSession } from './tour-session';
import { findByText, findTarget } from './tour-target';

// Interroge toutes les 100 ms jusqu'au délai ; rend la première valeur non nulle.
function wait<T>(read: () => T | null, ms: number): Promise<T | null> {
  const first = read();
  if (first !== null || ms <= 0) return Promise.resolve(first);
  return new Promise((resolve) => {
    const deadline = Date.now() + ms;
    const timer = window.setInterval(() => {
      const value = read();
      if (value !== null || Date.now() >= deadline) {
        window.clearInterval(timer);
        resolve(value);
      }
    }, 100);
  });
}

let openTourWindow: (session: TourSession) => void = () => undefined;

// La fenêtre de visite est montée par `mount.tsx` : elle s'enregistre ici pour éviter une dépendance circulaire.
export const setTourWindowOpener = (open: (session: TourSession) => void): void => {
  openTourWindow = open;
};

export const tourController = createTourController({
  storage: window.sessionStorage,
  now: Date.now,
  location: () => window.location,
  assign: (path) => window.location.assign(path),
  env: getTourEnv,
  openWindow: (session) => openTourWindow(session),
  find: (selector) => findTarget(selector),
  findText: (text) => findByText(text),
  click: (element) => (element as HTMLElement).click(),
  wait,
});

export const startTour = (steps: TourStep[]): void => tourController.start(steps);
export const resumeTour = (): boolean => tourController.resume();
