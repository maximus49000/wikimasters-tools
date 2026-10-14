import type { YMD } from './city/calendar';

// Heure locale d'un fuseau IANA (null = appareil), calculée sur l'appareil par Intl, sans réseau (spec lieu §3.3).

// Décalage d'un fuseau sur UTC à l'instant donné, en minutes (heure d'été comprise). Formateurs mis en cache par fuseau.
const formatters = new Map<string, Intl.DateTimeFormat>();
export function tzOffsetMinutes(tz: string, at: Date): number {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    formatters.set(tz, f);
  }
  const parts = Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!);
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

export type LocalClock = { minutes: number; seconds: number; date: YMD; offsetMin: number };

// Minute du jour (0 à 1439), seconde, date et décalage sur UTC d'un fuseau à l'instant `now`. Passage de minuit et changement d'heure
// gérés par Intl ; les secondes sont les mêmes dans tous les fuseaux (décalages à la minute près).
export function localClock(now: Date, tz: string | null): LocalClock {
  if (tz === null) {
    return { minutes: now.getHours() * 60 + now.getMinutes(), seconds: now.getSeconds(), date: { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }, offsetMin: -now.getTimezoneOffset() };
  }
  const offsetMin = tzOffsetMinutes(tz, now);
  const shifted = new Date(now.getTime() + offsetMin * 60_000);
  return {
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    seconds: now.getUTCSeconds(),
    date: { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() },
    offsetMin,
  };
}
