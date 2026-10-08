import type { TimeSetting } from './library-types';

// Minute locale (0 à 1439) que montre la Bibliothèque : réelle, jour forcé (midi), nuit forcée (minuit) ou choisie.
export function minutesFor(setting: TimeSetting, now: Date): number {
  switch (setting.mode) {
    case 'real':
      return now.getHours() * 60 + now.getMinutes();
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
