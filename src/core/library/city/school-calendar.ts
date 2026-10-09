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
  // Une réponse sans aucune période n'est pas un calendrier : elle est refusée.
  if (periods.length === 0) return null;
  return { zone: r.zone, periods };
}

// Repli approché (dates indicatives, sans zone) : jamais présenté comme officiel. Pour les années civiles `year - 1` et `year`.
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
// Dernier essai auprès du relais, réussi ou non : persisté pour que le délai survive à un rechargement.
type Attempt = { at: number; failed: boolean };

const DAY_MS = 86_400_000;
const KEY = (zone: Zone): string => `wmt:school-calendar:${zone}`;
const ATTEMPT_KEY = (zone: Zone): string => `wmt:school-calendar-attempt:${zone}`;
const FRESH_MS = 7 * DAY_MS;
const RETRY_MS = DAY_MS;
const TIMEOUT_MS = 10_000;

// Un appel qui ne répond pas dans le délai vaut échec. Le minuteur est nettoyé dans tous les cas.
function withTimeout<T>(pending: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('délai dépassé')), ms);
  });
  return Promise.race([pending, expired]).finally(() => clearTimeout(timer));
}

// Calendrier officiel par le relais. Cache de 7 jours ; après un échec, aucun nouvel essai pendant 24 h (heure du dernier essai
// persistée). Pendant ce délai ou après un échec, on sert le dernier cache (même périmé), puis le relevé approché. Ne lève jamais.
export function createSchoolCalendar(deps: Deps): { latest(zone: Zone): HolidayPeriod[]; refresh(zone: Zone): Promise<HolidayPeriod[]> } {
  const memory = new Map<Zone, Saved>();
  const attempts = new Map<Zone, Attempt>();
  const inFlight = new Map<Zone, Promise<HolidayPeriod[]>>();
  const fallback = (): HolidayPeriod[] => approximatePeriods(new Date(deps.now()).getUTCFullYear());
  // Une date dans le futur (horloge reculée) n'est jamais « récente » : elle ne vaut ni fraîcheur ni délai.
  const within = (at: number, ms: number): boolean => {
    const age = deps.now() - at;
    return age >= 0 && age < ms;
  };

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

  const loadAttempt = (zone: Zone): Attempt | null => {
    const cached = attempts.get(zone);
    if (cached) return cached;
    try {
      const text = deps.storage.get(ATTEMPT_KEY(zone));
      if (!text) return null;
      const a = JSON.parse(text) as Partial<Attempt>;
      if (typeof a.at !== 'number' || typeof a.failed !== 'boolean') return null;
      const attempt = { at: a.at, failed: a.failed };
      attempts.set(zone, attempt);
      return attempt;
    } catch {
      return null;
    }
  };

  const saveAttempt = (zone: Zone, attempt: Attempt): void => {
    attempts.set(zone, attempt);
    try {
      deps.storage.set(ATTEMPT_KEY(zone), JSON.stringify(attempt));
    } catch {
      // Stockage refusé : la mémoire suffit pour cette session.
    }
  };

  const fetchOnce = async (zone: Zone): Promise<HolidayPeriod[]> => {
    try {
      const body = await withTimeout(
        (async () => {
          const response = await deps.fetch(`${SCHOOL_RELAY}?zone=${zone}`);
          if (!response.ok) throw new Error('status');
          return (await response.json()) as unknown;
        })(),
        TIMEOUT_MS,
      );
      const parsed = parseSchoolReply(body);
      if (!parsed || parsed.zone !== zone) throw new Error('shape');
      const saved = { at: deps.now(), periods: parsed.periods };
      memory.set(zone, saved);
      try {
        deps.storage.set(KEY(zone), JSON.stringify(saved));
      } catch {
        // Stockage refusé : le cache mémoire suffit.
      }
      saveAttempt(zone, { at: deps.now(), failed: false });
      return saved.periods;
    } catch {
      saveAttempt(zone, { at: deps.now(), failed: true });
      return load(zone)?.periods ?? fallback();
    }
  };

  return {
    latest: (zone) => load(zone)?.periods ?? fallback(),
    refresh(zone) {
      const saved = load(zone);
      if (saved && within(saved.at, FRESH_MS)) return Promise.resolve(saved.periods);
      const attempt = loadAttempt(zone);
      if (attempt?.failed && within(attempt.at, RETRY_MS)) return Promise.resolve(saved?.periods ?? fallback());
      let pending = inFlight.get(zone);
      if (!pending) {
        pending = fetchOnce(zone).finally(() => inFlight.delete(zone));
        inFlight.set(zone, pending);
      }
      return pending;
    },
  };
}
