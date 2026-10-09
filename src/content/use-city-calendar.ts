import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { dayContext, type DayContext, type HolidayPeriod, type YMD } from '../core/library/city/calendar';
import { createSchoolCalendar, DEPARTMENT_RELAY } from '../core/library/city/school-calendar';
import { DEFAULT_ZONE, isAlsaceMoselle, zoneOfDepartment, type Zone } from '../core/library/city/zones';
import { currentPosition, isPositionKnown, subscribePosition } from './scene-position';
import { useZoneChoice } from './zone-setting';

// Zone → vacances → contexte du jour. La position n'est jamais enregistrée : seul le département déduit est mis en cache (par case de 0,1°).
// 1. Réglage manuel (A, B, C, Corse) : sans position ni relais de département.
// 2. Automatique + position connue : GET DEPARTMENT_RELAY?lat&lon (position arrondie à 0,1°), département → zone via zoneOfDepartment ; cache `wmt:city-department:<lat,lon>` valable 30 jours.
// 3. Sinon DEFAULT_ZONE.
// Le calendrier : un `createSchoolCalendar` par page (useMemo), `latest(zone)` en premier rendu, `refresh(zone)` ensuite (setState des périodes).

const DEPARTMENT_CACHE_MS = 30 * 86_400_000;
const DEPARTMENT_KEY = (cell: string): string => `wmt:city-department:${cell}`;

const storage = {
  get: (key: string): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string): void => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Stockage indisponible : le calendrier se contente de la mémoire.
    }
  },
};

const rounded = (v: number): number => Math.round(v * 10) / 10;

function cachedDepartment(cell: string): string | null {
  try {
    const raw = storage.get(DEPARTMENT_KEY(cell));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { at?: unknown; dept?: unknown };
    if (typeof saved.at !== 'number' || typeof saved.dept !== 'string') return null;
    const age = Date.now() - saved.at;
    return age >= 0 && age < DEPARTMENT_CACHE_MS ? saved.dept : null;
  } catch {
    return null;
  }
}

// Département de la case de 0,1° (cache local 30 jours, puis relais). Renvoie null en cas d'échec : la zone par défaut s'applique.
async function fetchDepartment(lat: number, lon: number): Promise<string | null> {
  const cell = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  const cached = cachedDepartment(cell);
  if (cached) return cached;
  try {
    const response = await fetch(`${DEPARTMENT_RELAY}?lat=${lat.toFixed(1)}&lon=${lon.toFixed(1)}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { ok?: unknown; dept?: unknown };
    if (body.ok !== true || typeof body.dept !== 'string') return null;
    storage.set(DEPARTMENT_KEY(cell), JSON.stringify({ at: Date.now(), dept: body.dept }));
    return body.dept;
  } catch {
    return null;
  }
}

// Département déduit de la position connue (null tant qu'inconnu ou en réglage manuel).
function useDepartment(enabled: boolean): string | null {
  const position = useSyncExternalStore(subscribePosition, () => currentPosition(), () => currentPosition());
  const known = isPositionKnown();
  const lat = rounded(position.lat);
  const lon = rounded(position.lon);
  const [found, setFound] = useState<{ cell: string; dept: string } | null>(null);
  const cell = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  useEffect(() => {
    if (!enabled || !known) return;
    let alive = true;
    void fetchDepartment(lat, lon).then((dept) => {
      if (alive && dept) setFound({ cell, dept });
    });
    return () => {
      alive = false;
    };
  }, [enabled, known, lat, lon, cell]);
  return enabled && known && found?.cell === cell ? found.dept : null;
}

export function useCityDay(date: YMD): DayContext {
  const [choice] = useZoneChoice();
  const dept = useDepartment(choice === 'auto');
  const zone: Zone = choice !== 'auto' ? choice : ((dept ? zoneOfDepartment(dept) : null) ?? DEFAULT_ZONE);
  const alsace = choice === 'auto' && dept !== null && isAlsaceMoselle(dept);
  const calendar = useMemo(() => createSchoolCalendar({ fetch: (url) => fetch(url), now: () => Date.now(), storage }), []);
  const [loaded, setLoaded] = useState<{ zone: Zone; periods: HolidayPeriod[] }>(() => ({ zone, periods: calendar.latest(zone) }));
  // Changement de zone : les périodes connues de la nouvelle zone s'affichent tout de suite, avant le rafraîchissement.
  const periods = loaded.zone === zone ? loaded.periods : calendar.latest(zone);
  useEffect(() => {
    let alive = true;
    void calendar.refresh(zone).then((fresh) => {
      if (alive) setLoaded({ zone, periods: fresh });
    });
    return () => {
      alive = false;
    };
  }, [calendar, zone]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => dayContext(date, periods, alsace), [date.y, date.m, date.d, periods, alsace]);
}
