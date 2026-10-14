import type { TimeSetting } from './library-types';
import { localClock } from './scene-clock';

// Minute locale (0 à 1439) que montre la Bibliothèque : réelle (dans le fuseau de la scène, `tz` null = appareil), jour forcé (midi),
// nuit forcée (minuit) ou choisie.
export function minutesFor(setting: TimeSetting, now: Date, tz: string | null = null): number {
  switch (setting.mode) {
    case 'real':
      return localClock(now, tz).minutes;
    case 'day':
      return 720;
    case 'night':
      return 0;
    case 'manual':
      return setting.minutes;
  }
}

export function formatMinutes(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
