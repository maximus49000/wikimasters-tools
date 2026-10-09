import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { dayContext, type DayContext, type HolidayPeriod, type YMD } from '../core/library/city/calendar';
import { createSchoolCalendar, DEPARTMENT_RELAY } from '../core/library/city/school-calendar';
import { DEFAULT_ZONE, isAlsaceMoselle, zoneOfDepartment, type Zone } from '../core/library/city/zones';
import { currentPosition, isPositionKnown, subscribePosition } from './scene-position';
import { useZoneChoice } from './zone-setting';

// Zone → vacances → contexte du jour. La position n'est jamais enregistrée ; le département déduit n'est pas non plus écrit :
// il reste en mémoire le temps de la page (cache du module, par case de 0,1°, succès comme échec), jamais dans le stockage.
// 1. Réglage manuel (A, B, C, Corse) : sans position ni relais de département.
// 2. Automatique + position connue : GET DEPARTMENT_RELAY?lat&lon (position arrondie à 0,1°), département → zone via zoneOfDepartment ; une seule requête par case et par page.
// 3. Sinon DEFAULT_ZONE.
// Le calendrier : un `createSchoolCalendar` par page (useMemo), `latest(zone)` en premier rendu, `refresh(zone)` ensuite (setState des périodes).
// Sans pièce Ville (`enabled` faux) : ni département ni calendrier scolaire ne sont demandés (jours fériés seuls).

const DEPARTMENT_TIMEOUT_MS = 10_000;

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

// `+ 0` : -0 devient 0 (clé de case « -0.0 » évitée).
const rounded = (v: number): number => Math.round(v * 10) / 10 + 0;

// Case de 0,1° → réponse du relais (promesse partagée : un seul appel, même pendant qu'il est en cours). null : échec.
const departments = new Map<string, Promise<string | null>>();

// Remise à zéro du cache mémoire (tests uniquement).
export function resetDepartmentCacheForTests(): void {
  departments.clear();
}

async function requestDepartment(lat: number, lon: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEPARTMENT_TIMEOUT_MS);
  try {
    const response = await fetch(`${DEPARTMENT_RELAY}?lat=${lat.toFixed(1)}&lon=${lon.toFixed(1)}`, { signal: controller.signal });
    if (!response.ok) throw new Error('status');
    const body = (await response.json()) as { ok?: unknown; dept?: unknown };
    if (body.ok !== true || typeof body.dept !== 'string') throw new Error('shape');
    return body.dept;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Département de la case de 0,1° (mémoire de la page, puis relais). Renvoie null en cas d'échec : la zone par défaut s'applique.
function fetchDepartment(lat: number, lon: number): Promise<string | null> {
  const cell = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  let pending = departments.get(cell);
  if (!pending) {
    pending = requestDepartment(lat, lon);
    departments.set(cell, pending);
  }
  return pending;
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

// `enabled` : au moins une pièce Ville ; sinon aucune requête (département, calendrier scolaire).
export function useCityDay(date: YMD, enabled = true): DayContext {
  const [choice] = useZoneChoice();
  const dept = useDepartment(enabled && choice === 'auto');
  const zone: Zone = choice !== 'auto' ? choice : ((dept ? zoneOfDepartment(dept) : null) ?? DEFAULT_ZONE);
  // Un réglage manuel ignore l'Alsace-Moselle (aucun département déduit).
  const alsace = choice === 'auto' && dept !== null && isAlsaceMoselle(dept);
  const calendar = useMemo(() => createSchoolCalendar({ fetch: (url) => fetch(url), now: () => Date.now(), storage }), []);
  const [loaded, setLoaded] = useState<{ zone: Zone; periods: HolidayPeriod[] }>(() => ({ zone, periods: calendar.latest(zone) }));
  // Changement de zone : les périodes connues de la nouvelle zone s'affichent tout de suite, avant le rafraîchissement.
  const periods = loaded.zone === zone ? loaded.periods : calendar.latest(zone);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void calendar.refresh(zone).then((fresh) => {
      if (alive) setLoaded({ zone, periods: fresh });
    });
    return () => {
      alive = false;
    };
  }, [calendar, zone, enabled]);
  const { y, m, d } = date;
  return useMemo(() => dayContext({ y, m, d }, periods, alsace), [y, m, d, periods, alsace]);
}
