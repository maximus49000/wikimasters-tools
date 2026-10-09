import { RELAY_BASE } from '../../documentary/config';
import type { HolidayPeriod } from './calendar';
import { ZONES, type Zone } from './zones';

export const SCHOOL_RELAY = `${RELAY_BASE}/school-calendar`;
export const DEPARTMENT_RELAY = `${RELAY_BASE}/department`;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isZone = (v: unknown): v is Zone => typeof v === 'string' && (ZONES as readonly string[]).includes(v);

export function parseSchoolReply(raw: unknown): { zone: Zone; periods: HolidayPeriod[] } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { ok?: unknown; zone?: unknown; periods?: unknown };
  if (r.ok !== true || !isZone(r.zone) || !Array.isArray(r.periods)) return null;
  const periods: HolidayPeriod[] = [];
  for (const p of r.periods as Record<string, unknown>[]) {
    if (typeof p?.name !== 'string' || typeof p.start !== 'string' || typeof p.end !== 'string') return null;
    if (!ISO.test(p.start) || !ISO.test(p.end) || p.end <= p.start) return null;
    periods.push({ name: p.name, start: p.start, end: p.end });
  }
  return { zone: r.zone, periods };
}

// Repli approché (dates indicatives, sans zone) : jamais présenté comme officiel. Pour l'année civile `year` et la précédente.
export function approximatePeriods(year: number): HolidayPeriod[] {
  const out: HolidayPeriod[] = [];
  for (const y of [year - 1, year]) {
    out.push({ name: 'Vacances de la Toussaint (approché)', start: `${y}-10-19`, end: `${y}-11-03` });
    out.push({ name: 'Vacances de Noël (approché)', start: `${y}-12-20`, end: `${y + 1}-01-05` });
    out.push({ name: 'Vacances d’été (approché)', start: `${y}-07-06`, end: `${y}-09-01` });
  }
  return out;
}

type Deps = {
  fetch: (url: string) => Promise<Response>;
  now: () => number;
  storage: { get(key: string): string | null; set(key: string, value: string): void };
};
type Saved = { at: number; periods: HolidayPeriod[] };

const KEY = (zone: Zone): string => `wmt:school-calendar:${zone}`;
const FRESH_MS = 7 * 86_400_000;
const BACKOFF_MS = 15 * 60_000;

// Calendrier officiel par le relais, cache de 7 jours (une requête au plus par jour même en échec), repli approché. Ne lève jamais.
export function createSchoolCalendar(deps: Deps): { latest(zone: Zone): HolidayPeriod[]; refresh(zone: Zone): Promise<HolidayPeriod[]> } {
  const memory = new Map<Zone, Saved>();
  const retryAt = new Map<Zone, number>();
  const inFlight = new Map<Zone, Promise<HolidayPeriod[]>>();
  const fallback = (): HolidayPeriod[] => approximatePeriods(new Date(deps.now()).getUTCFullYear());

  const load = (zone: Zone): Saved | null => {
    const cached = memory.get(zone);
    if (cached) return cached;
    try {
      const text = deps.storage.get(KEY(zone));
      if (!text) return null;
      const s = JSON.parse(text) as Partial<Saved>;
      if (typeof s.at !== 'number' || !Array.isArray(s.periods)) return null;
      const parsed = parseSchoolReply({ ok: true, zone, periods: s.periods });
      if (!parsed) return null;
      const saved = { at: s.at, periods: parsed.periods };
      memory.set(zone, saved);
      return saved;
    } catch {
      return null;
    }
  };

  const fetchOnce = async (zone: Zone): Promise<HolidayPeriod[]> => {
    try {
      const response = await deps.fetch(`${SCHOOL_RELAY}?zone=${zone}`);
      if (!response.ok) throw new Error('status');
      const parsed = parseSchoolReply(await response.json());
      if (!parsed || parsed.zone !== zone) throw new Error('shape');
      const saved = { at: deps.now(), periods: parsed.periods };
      memory.set(zone, saved);
      try {
        deps.storage.set(KEY(zone), JSON.stringify(saved));
      } catch {
        // Stockage refusé : le cache mémoire suffit.
      }
      return saved.periods;
    } catch {
      retryAt.set(zone, deps.now() + BACKOFF_MS);
      return load(zone)?.periods ?? fallback();
    }
  };

  return {
    latest: (zone) => load(zone)?.periods ?? fallback(),
    refresh(zone) {
      const saved = load(zone);
      if (saved && deps.now() - saved.at < FRESH_MS) return Promise.resolve(saved.periods);
      if (deps.now() < (retryAt.get(zone) ?? 0)) return Promise.resolve(saved?.periods ?? fallback());
      let pending = inFlight.get(zone);
      if (!pending) {
        pending = fetchOnce(zone).finally(() => inFlight.delete(zone));
        inFlight.set(zone, pending);
      }
      return pending;
    },
  };
}
